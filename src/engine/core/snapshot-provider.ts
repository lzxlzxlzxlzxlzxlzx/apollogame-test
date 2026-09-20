import type { SystemDeclaration } from './types.js';
import type { Transform, FrameStartTransform } from '../protocol/components.js';

/** Shared decision snapshot, installed by declared consumers, never by movement. */
export const frameStartTransformSystem: SystemDeclaration = {
  id: 'frame-start-transform', phase: -2,
  reads: ['Transform'], writes: ['FrameStartTransform'], consumes: [],
  execute(world) {
    for (const [id, components] of world.query('Transform')) {
      const position = components.get('Transform') as Transform;
      const snapshot = components.get('FrameStartTransform') as FrameStartTransform | undefined;
      if (snapshot) { snapshot.x = position.x; snapshot.y = position.y; }
      else world.addComponent(id, { type: 'FrameStartTransform', x: position.x, y: position.y } as FrameStartTransform);
    }
  },
};

/** Runtime and audit use the same expansion; user declarations remain visible, including duplicates. */
export function withSnapshotProvider(systems: readonly SystemDeclaration[]): SystemDeclaration[] {
  if (!systems.some(system => system.reads.includes('FrameStartTransform')) ||
      systems.some(system => system.id === frameStartTransformSystem.id)) return [...systems];
  return [frameStartTransformSystem, ...systems];
}
