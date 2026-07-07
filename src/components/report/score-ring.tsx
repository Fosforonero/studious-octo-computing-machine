export function ScoreRing({ score }: { score: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  return <div className="relative size-48"><svg viewBox="0 0 100 100" className="size-full -rotate-90"><circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-white/10" /><circle cx="50" cy="50" r={radius} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} /></svg><div className="absolute inset-0 grid place-items-center text-center"><div><strong className="display text-6xl">{score}</strong><span className="block text-[10px] font-bold uppercase tracking-widest opacity-50">out of 100</span></div></div></div>;
}
