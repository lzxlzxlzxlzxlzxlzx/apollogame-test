/** Minecraft compatibility contract. No entity identity or game-specific branches. */
export function armorMitigation(damage:number,armor:number,toughness:number,bypass=false):number {
  if(![damage,armor,toughness].every(Number.isFinite)||armor<0||toughness<0)throw Error('Invalid armor mitigation inputs');
  if(damage<=0||bypass)return damage;
  const g=Math.min(20,Math.max(armor/5,armor-4*damage/(toughness+8)));
  return damage*(1-g/25);
}
