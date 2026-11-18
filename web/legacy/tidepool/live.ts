import { createContext, useContext } from 'react';

// Live numbers that some items show: the treasure fills up as money is spent.

export interface TideLive {
  /** Money spent by the sessions in the tank, in dollars. */
  spend: number;
}

export const TideLiveContext = createContext<TideLive>({ spend: 12 });

/** Coins for a treasure: more spend, more coins, in steps so the heap isn't rebuilt every second. */
export function useCoins(max = 150): number {
  const { spend } = useContext(TideLiveContext);
  const n = 10 + Math.sqrt(Math.max(0, spend)) * 12;
  return Math.min(max, Math.round(n / 10) * 10);
}
