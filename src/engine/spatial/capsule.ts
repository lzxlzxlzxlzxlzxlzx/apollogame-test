import type { Shape, Transform } from '@engine/protocol/components.js';
export interface Point { x: number; y: number }
export interface Capsule { a: Point; b: Point; radius: number }
/** Fixed arithmetic polynomial: no implementation-dependent runtime trig. */
export function capsuleAxis(t: Pick<Transform, 'rotation'>, s: Shape): Point {
  let x = s.axisX ?? 0, y = s.axisY ?? 0;
  if (s.axisX === undefined && s.axisY === undefined) {
    const pi = 3.141592653589793;
    let a = ((t.rotation % (2*pi)) + 3*pi) % (2*pi) - pi;
    let sign = 1;
    if (a > pi/2) { a -= pi; sign = -1; }
    if (a < -pi/2) { a += pi; sign = -1; }
    let sin = a, cos = 1, st = a, ct = 1;
    for (let n=1;n<=9;n++) { st *= -a*a/((2*n)*(2*n+1)); ct *= -a*a/((2*n-1)*(2*n)); sin += st; cos += ct; }
    x = sign*cos; y = sign*sin;
  }
  const m = Math.sqrt(x*x+y*y);
  return m > 0 && Number.isFinite(m) ? { x:x/m, y:y/m } : { x:1,y:0 };
}
export function capsuleOf(t: Pick<Transform,'x'|'y'|'rotation'>, s: Shape): Capsule {
  const axis = capsuleAxis(t,s), h = Math.max(0,s.length ?? 0)/2;
  return { a:{x:t.x-axis.x*h,y:t.y-axis.y*h}, b:{x:t.x+axis.x*h,y:t.y+axis.y*h}, radius:Math.max(0,s.radius ?? 0) };
}
function closest(p: Point,a: Point,b: Point): Point {
  const x=b.x-a.x,y=b.y-a.y,d=x*x+y*y;
  const u=d ? Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/d)):0;
  return {x:a.x+x*u,y:a.y+y*u};
}
function axis(a: Point,b: Point): Point | undefined {
  const x=b.x-a.x,y=b.y-a.y,m=Math.sqrt(x*x+y*y);
  return m>0 ? {x:x/m,y:y/m}:undefined;
}
/** SAT for a swept disk against another swept disk or convex polygon.
 * Candidate axes include straight-side normals and every curved endpoint seam. */
export function capsuleContact(a: Capsule, b: Capsule | Point[]): {nx:number;ny:number;depth:number}|null {
  const poly=Array.isArray(b), points:Point[]=poly ? b : [b.a,b.b];
  const br=poly ? 0 : b.radius;
  if (!points.length) return null;
  const axes:Point[]=[];
  const normal=(p:Point,q:Point)=>{const v=axis(p,q);if(v)axes.push({x:-v.y,y:v.x});};
  normal(a.a,a.b);
  if(poly) for(let i=0;i<points.length;i++)normal(points[i]!,points[(i+1)%points.length]!);
  else normal(b.a,b.b);
  for(const p of points) {const v=axis(closest(p,a.a,a.b),p);if(v)axes.push(v);}
  if(!poly)for(const p of [a.a,a.b]) {const v=axis(p,closest(p,b.a,b.b));if(v)axes.push(v);}
  if(!axes.length) axes.push({x:1,y:0},{x:0,y:1});
  let depth=Infinity,nx=0,ny=0;
  for(const v of axes){
    const a0=a.a.x*v.x+a.a.y*v.y,a1=a.b.x*v.x+a.b.y*v.y;
    const amin=Math.min(a0,a1)-a.radius,amax=Math.max(a0,a1)+a.radius;
    const ps=points.map(p=>p.x*v.x+p.y*v.y),bmin=Math.min(...ps)-br,bmax=Math.max(...ps)+br;
    if(amax<=bmin||bmax<=amin)return null;
    const forward=amax-bmin,backward=bmax-amin,overlap=Math.min(forward,backward);
    if(overlap<depth){depth=overlap; const sign=forward<=backward?1:-1;nx=v.x*sign;ny=v.y*sign;}
  }
  return {nx,ny,depth};
}
