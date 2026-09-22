import type { World } from '@engine/core/world.js';
import type { Command } from './commands.js';
import { applyCommands } from './commands.js';
import { hashWorld } from './world-hash.js';

// ═══════════════════════════════════════════════════════════════
//  Lockstep 会话 — 内存版"多个对端"传输层
// ═══════════════════════════════════════════════════════════════
//
//  真实 lockstep：每个对端各自跑一份**相同**的模拟，逐 tick 交换各自的命令，
//  收齐后用**同一组命令**步进，于是大家始终一致。本类把"网络"换成内存：
//  每 tick 把同一组命令派发给所有对端，各自步进后逐端求哈希。
//
//  确定性守卫：若任一对端哈希与他人不同 → desync。正常情况下永远 inSync；
//  一旦有人丢包/作弊/非确定性代码导致状态分叉，本守卫立刻在那一 tick 报警。
// ═══════════════════════════════════════════════════════════════

export interface PeerHash {
  readonly id: string;
  readonly hash: string;
}

export interface StepReport {
  readonly tick: number;
  readonly peers: PeerHash[];
  readonly inSync: boolean; // 所有对端哈希一致
  readonly hash: string | null; // 一致时的共识哈希，分叉时为 null
}

interface Peer {
  readonly id: string;
  readonly world: World;
}

export class LockstepSession {
  private readonly peers: Peer[];
  private tick = 0;

  constructor(peers: Peer[]) {
    if (peers.length === 0) throw new Error('LockstepSession 至少需要一个对端');
    this.peers = peers;
  }

  // 正常步进：同一组命令派发给所有对端（真实 lockstep 的语义）。
  advance(commands: Command[]): StepReport {
    return this.advanceDivergent(() => commands);
  }

  // 故意让各对端收到不同命令——用于演示/测试 desync 检测（如模拟丢包、作弊客户端）。
  advanceDivergent(commandsFor: (peerId: string) => Command[]): StepReport {
    this.tick++;
    for (const p of this.peers) {
      applyCommands(p.world, commandsFor(p.id));
      p.world.tick();
    }
    return this.report();
  }

  private report(): StepReport {
    const peers: PeerHash[] = this.peers.map((p) => ({
      id: p.id,
      hash: hashWorld(p.world), // P2c 增量·同值
    }));
    const first = peers[0].hash;
    const inSync = peers.every((p) => p.hash === first);
    return { tick: this.tick, peers, inSync, hash: inSync ? first : null };
  }

  get currentTick(): number {
    return this.tick;
  }
}
