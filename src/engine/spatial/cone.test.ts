import { describe, expect, it } from 'vitest';
import { contactBetween } from './contact.js';
import type { Shape, Transform } from '@engine/protocol/components.js';
const t=(x:number,y:number,rotation=0):Transform=>({type:'Transform',x,y,rotation,scaleX:1,scaleY:1});
describe('cone contact',()=>it('includes forward boundary and excludes outside angle/range',()=>{
  const cone:Shape={type:'Shape',kind:'cone',radius:4,angle:Math.PI/3};
  const c:Shape={type:'Shape',kind:'circle',radius:.1};
  expect(contactBetween(t(0,0),cone,t(3,0),c)).not.toBeNull();
  expect(contactBetween(t(0,0),cone,t(3,2),c)).toBeNull();
  expect(contactBetween(t(0,0),cone,t(4.2,0),c)).toBeNull();
}));
