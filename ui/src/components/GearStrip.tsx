import { memo } from "react";

interface Props {
  gear: number | null;
}

const GEARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const GearStrip = memo(function GearStrip({ gear }: Props) {
  return (
    <div>
      <span className="text-[12px] font-normal text-gray-500 mb-1 block">GANG</span>
      <div className="flex gap-2 items-center">
        {GEARS.map((g) => (
          <div
            key={g}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full ${
              g === gear
                ? "bg-blue-500 text-gray-50 text-[32px] font-bold"
                : "text-gray-600 text-[20px] font-normal"
            }`}
          >
            {g}
          </div>
        ))}
      </div>
    </div>
  );
});
