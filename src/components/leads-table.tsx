import { Badge, TableWrap, td, th } from "@/components/ui";
import type { LeadRow } from "@/lib/data/reports";
import { dateTime, money } from "@/lib/format";

const lifecycleTone: Record<string, "neutral" | "brand" | "good" | "bad" | "warn"> = {
  new: "brand", contacted: "neutral", qualified: "neutral", booked: "warn", showed: "warn", won: "good", lost: "bad", unqualified: "bad",
};
const channelLabel: Record<string, string> = {
  meta_form: "Meta lead form", meta_landing_page: "Meta → landing page", other_paid: "Other paid", organic: "Organic", unknown: "Unknown",
};

export function LeadsTable({
  rows,
  clientNames,
  segmentNames,
  showClient = true,
}: {
  rows: LeadRow[];
  clientNames: Map<string, string>;
  segmentNames: Map<string, string>;
  showClient?: boolean;
}) {
  return (
    <TableWrap>
      <table className="w-full">
        <thead className="border-b border-line">
          <tr>
            <th className={th}>Lead</th>
            <th className={th}>Received</th>
            {showClient && <th className={th}>Client</th>}
            <th className={th}>Segment</th>
            <th className={th}>Channel</th>
            <th className={th}>Campaign / ad</th>
            <th className={th}>Stage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((l) => (
            <tr key={l.id} className="align-top hover:bg-surface-2/60">
              <td className={td}>
                <div className="font-medium">{[l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}</div>
                <div className="text-xs text-ink-3">{l.email ?? l.phone ?? ""}</div>
              </td>
              <td className={`${td} tabular text-ink-2`}>{dateTime(l.crm_created_at)}</td>
              {showClient && <td className={td}>{clientNames.get(l.client_id) ?? "—"}</td>}
              <td className={td}>{(l.segment_id && segmentNames.get(l.segment_id)) || "—"}</td>
              <td className={`${td} text-ink-2`}>{channelLabel[l.channel ?? "unknown"] ?? l.channel}</td>
              <td className={`${td} max-w-72`}>
                {l.attributed_campaign_name ? (
                  <>
                    <div className="truncate" title={l.attributed_campaign_name}>{l.attributed_campaign_name}</div>
                    <div className="truncate text-xs text-ink-3" title={l.attributed_ad_name ?? ""}>{l.attributed_ad_name ?? "Ad not matched"}</div>
                  </>
                ) : (
                  <span className="text-ink-3">Not attributed</span>
                )}
              </td>
              <td className={td}>
                <div className="flex items-center gap-1.5">
                  <Badge tone={lifecycleTone[l.lifecycle] ?? "neutral"}>{l.lifecycle}</Badge>
                  {l.value != null && <span className="tabular text-xs text-ink-2">{money(l.value)}</span>}
                </div>
                {l.stage_name && l.stage_name.toLowerCase() !== l.lifecycle && (
                  <div className="mt-0.5 text-xs text-ink-3">{l.stage_name}</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
