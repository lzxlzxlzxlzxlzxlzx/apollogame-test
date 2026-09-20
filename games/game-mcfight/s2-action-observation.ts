import type { World } from '@engine/core/world.js';
// Read-only observer for the S2 debug view. Never writes a world component.
export class ActionObservation {
  private hp = new Map<string,number>();
  private facing: 1|-1 = 1;
  private captured: string | undefined;
  reset(){this.hp.clear();this.facing=1;this.captured=undefined;}
  sample(w:World){
    const flow=w.getComponent<any>('melee','GameFlow');
    const anim=w.getComponent<any>('melee','AnimState');
    const source=w.getComponent<any>('melee','Transform');
    const locked=flow?.targetSnapshot?.targetId as string|undefined;
    if(locked && !this.captured && source){
      const target=w.getComponent<any>(locked,'FrameStartTransform');
      const origin=w.getComponent<any>('melee','FrameStartTransform')??source;
      if(target)this.facing=target.x<origin.x?-1:1;
      this.captured=locked;
    }
    if(!locked)this.captured=undefined;
    const hits:Array<{id:string;amount:number;x:number;y:number}>=[];
    const next=new Map<string,number>();
    for(const [id] of w.query('Resource')){
      const resource=w.getComponent<any>(id,'Resource')!;
      if(resource.id!=='hp')continue;
      next.set(id,resource.current);
      const before=this.hp.get(id),t=w.getComponent<any>(id,'Transform');
      if(before!==undefined&&resource.current<before&&t)hits.push({id,amount:before-resource.current,x:t.x,y:t.y});
    }
    this.hp=next;
    return {visible:!!source&&!!anim,clip:anim?.current,frame:w.getComponent<any>('melee','Frame')?.index,facing:this.facing,hits};
  }
}

