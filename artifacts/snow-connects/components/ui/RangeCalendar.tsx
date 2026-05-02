import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { TR_WEEKDAY_HEADERS, monthLabel } from "@/lib/format";
import { isInSeason, isoDate, stripTime } from "@/lib/season";

interface Props {
  from: string | null;
  to: string | null;
  onChange: (range: { from: string | null; to: string | null }) => void;
  minDate?: Date;
}

export function RangeCalendar({ from, to, onChange, minDate }: Props) {
  const c = useColors();
  const today = stripTime(new Date());

  // Cursor: which month is shown. Anchor it on `from` if set, otherwise today
  // (or the minDate). The user can page month by month.
  const initial = from ? new Date(from) : minDate ?? today;
  const [cursor, setCursor] = useState<Date>(
    new Date(initial.getFullYear(), initial.getMonth(), 1),
  );

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startWd = (first.getDay() + 6) % 7; // Monday=0
    const daysInMonth = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + 1,
      0,
    ).getDate();
    const out: ({ d: Date } | null)[] = [];
    for (let i = 0; i < startWd; i++) out.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      out.push({ d: new Date(cursor.getFullYear(), cursor.getMonth(), day) });
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const min = stripTime(minDate ?? today);
  const fromTs = from ? new Date(from).getTime() : null;
  const toTs = to ? new Date(to).getTime() : null;

  function tap(iso: string, d: Date) {
    const t = d.getTime();
    // No anchor yet, or both anchors set → start a fresh range from this tap.
    if (!from || (from && to)) {
      onChange({ from: iso, to: null });
      return;
    }
    // We have `from` but no `to`. If the user picks an earlier date,
    // normalize so the range completes in two taps instead of three:
    // the earlier tap becomes the new check-in and the original becomes
    // the check-out.
    if (fromTs !== null && t < fromTs) {
      onChange({ from: iso, to: from });
      return;
    }
    onChange({ from, to: iso });
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.header}>
        <Pressable
          onPress={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
          }
          hitSlop={10}
        >
          <Feather name="chevron-left" size={22} color={c.foreground} />
        </Pressable>
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Inter_600SemiBold",
            fontSize: 16,
          }}
        >
          {monthLabel(cursor.getFullYear(), cursor.getMonth())}
        </Text>
        <Pressable
          onPress={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
          }
          hitSlop={10}
        >
          <Feather name="chevron-right" size={22} color={c.foreground} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {TR_WEEKDAY_HEADERS.map((d) => (
          <Text
            key={d}
            style={[styles.weekHead, { color: c.mutedForeground }]}
          >
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, i) => {
          if (!cell) return <View key={i} style={styles.cell} />;
          const iso = isoDate(cell.d);
          const t = cell.d.getTime();
          const inSeason = isInSeason(cell.d);
          const allowed = t >= min.getTime() && inSeason;
          const isFrom = fromTs !== null && t === fromTs;
          const isTo = toTs !== null && t === toTs;
          const isBetween =
            fromTs !== null && toTs !== null && t > fromTs && t < toTs;
          const endpoint = isFrom || isTo;

          // Three layers of background:
          // - "between" days get a soft secondary tint that visually bridges
          //   the two endpoints
          // - endpoint days get the solid primary fill on top
          // - everything else is transparent
          const backgroundColor = endpoint
            ? c.primary
            : isBetween
              ? c.secondary
              : "transparent";

          const textColor = endpoint
            ? c.primaryForeground
            : !allowed
              ? c.slateMuted
              : c.foreground;

          return (
            <Pressable
              key={i}
              disabled={!allowed}
              onPress={() => tap(iso, cell.d)}
              style={[
                styles.cell,
                {
                  backgroundColor,
                  borderRadius: c.radius,
                },
              ]}
            >
              <Text
                style={{
                  color: textColor,
                  fontFamily: endpoint
                    ? "Inter_700Bold"
                    : isBetween
                      ? "Inter_600SemiBold"
                      : "Inter_400Regular",
                  fontSize: 14,
                }}
              >
                {cell.d.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  weekRow: {
    flexDirection: "row",
  },
  weekHead: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
