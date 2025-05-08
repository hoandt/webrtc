
import { FC, forwardRef } from 'react';

const LiveIndicator = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div
      ref={ref}
      className="hidden fixed top-4 right-4 bg-red-500 text-white font-bold text-sm px-3 py-1 rounded-full shadow-lg animate-pulse border-2 border-white z-20"
    >
      ● livestreaming
    </div>
  );
});

LiveIndicator.displayName = 'LiveIndicator';

export default LiveIndicator;

