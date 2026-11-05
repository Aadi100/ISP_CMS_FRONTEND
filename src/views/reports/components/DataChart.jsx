import { Chart } from "@/base-components";
import { colors } from "@/utils";
import { useRecoilValue } from "recoil";
import { darkMode as darkModeStore } from "@/stores/dark-mode";
import { useMemo } from "react";

const palette = () => [
  colors.primary(0.9),
  colors.success(0.9),
  colors.warning(0.9),
  colors.danger(0.9),
  colors.pending(0.9),
  colors.slate["400"](),
  colors.slate["600"](),
];

/**
 * Small data-driven chart. type: "bar" | "doughnut" | "line".
 * datasets: [{ label, data }] (one dataset for doughnut).
 * Pass memoised `labels` / `datasets` to avoid needless redraws.
 */
function DataChart({ type = "bar", labels, datasets, height = 240, stacked = false }) {
  const darkMode = useRecoilValue(darkModeStore);

  const data = useMemo(() => {
    const p = palette();
    return {
      labels,
      datasets: datasets.map((d, i) =>
        type === "doughnut"
          ? {
              ...d,
              backgroundColor: labels.map((_, j) => p[j % p.length]),
              borderWidth: 4,
              borderColor: darkMode ? colors.darkmode[700]() : colors.white,
            }
          : {
              ...d,
              backgroundColor: p[i % p.length],
              borderColor: p[i % p.length],
              barPercentage: 0.6,
              maxBarThickness: 28,
              tension: 0.3,
            }
      ),
    };
  }, [labels, datasets, type, darkMode]);

  const options = useMemo(() => {
    const tick = { color: colors.slate["500"](0.8), font: { size: 11 } };
    return {
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: datasets.length > 1 || type === "doughnut",
          labels: { color: colors.slate["500"](0.8) },
        },
      },
      ...(type === "doughnut"
        ? { cutout: "65%" }
        : {
            scales: {
              x: { stacked, ticks: tick, grid: { display: false, drawBorder: false } },
              y: {
                stacked,
                beginAtZero: true,
                ticks: tick,
                grid: {
                  color: darkMode ? colors.slate["500"](0.3) : colors.slate["300"](),
                  borderDash: [2, 2],
                  drawBorder: false,
                },
              },
            },
          }),
    };
  }, [datasets.length, type, stacked, darkMode]);

  return <Chart type={type} height={height} data={data} options={options} />;
}

export default DataChart;
