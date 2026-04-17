import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  ESTIMATE_STATUS_LABELS,
  type EstimateStatus,
} from "@/lib/api/types";

const VARIANT_MAP: Record<EstimateStatus, BadgeProps["variant"]> = {
  draft: "secondary",
  in_progress: "default",
  review: "warning",
  ready: "success",
  transmitted: "outline",
  archived: "outline",
};

export function StatusBadge({ status }: { status: EstimateStatus }) {
  return (
    <Badge variant={VARIANT_MAP[status]}>
      {ESTIMATE_STATUS_LABELS[status]}
    </Badge>
  );
}
