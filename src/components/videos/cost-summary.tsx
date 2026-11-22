import { formatUsd } from "@/lib/money";
import { creditsLabel, type VideoViewJson } from "./labels";

/** Lo que lleva costado el vídeo, en cada moneda por separado: «Higgsfield: 22 créditos · Claude: 0,12 US$». */
export function CostSummary({ costs }: { costs: VideoViewJson["costs"] }) {
  return (
    <p className="text-sm text-muted-foreground tabular-nums" aria-label="Coste del vídeo">
      Higgsfield: <span className="text-foreground">{creditsLabel(costs.higgsfieldCredits)}</span>
      <span aria-hidden className="mx-2">
        ·
      </span>
      Claude: <span className="text-foreground">{formatUsd(costs.claudeMicros)}</span>
    </p>
  );
}
