import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { isoDate, isInSeason, stripTime } from "@/lib/season";
import { TR_WEEKDAY_HEADERS, monthLabel } from "@/lib/format";

interface Props {
  value: string | null; // ISO date
  onChange: (iso: string) => void;
  minDate?: Date;
  /** When true, only days inside the ski season are selectable. */
  seasonGate?: boolean;
}

export function MonthCalendar({
  value,
  onChange,
  minDate,
  seasonGate = true,
}: Props) {
  const c = useColors();
  const today = stripTime(new Date());
  const initial = value ? new Date(value) : minDate ?? today;
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
          const selected = iso === value;
          const inSeason = !seasonGate || isInSeason(cell.d);
          const allowed = cell.d.getTime() >= min.getTime() && inSeason;
          return (
            <Pressable
              key={i}
              disabled={!allowed}
              onPress={() => onChange(iso)}
              style={[
                styles.cell,
                {
                  backgroundColor: selected ? c.accent : "transparent",
                  borderRadius: c.radius,
                },
              ]}
            >
              <Text
                style={{
                  color: selected
                    ? c.accentForeground
                    : !allowed
                      ? c.slateMuted
                      : c.foreground,
                  fontFamily: selected
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
