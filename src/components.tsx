import { Text, View } from "nsh";
import type { ViewStyle } from "nsh";
import { colors, font, text } from "./theme";

export type Tone = "accent" | "info" | "success" | "warning" | "danger" | "muted";

function toneColor(tone: Tone | undefined): string {
  switch (tone) {
    case "accent":
      return colors.accentStrong;
    case "info":
      return colors.info;
    case "success":
      return colors.success;
    case "warning":
      return colors.warning;
    case "danger":
      return colors.danger;
    default:
      return colors.muted;
  }
}

function toneBackground(tone: Tone | undefined): string {
  switch (tone) {
    case "accent":
      return colors.accentSoft;
    case "info":
      return colors.infoSoft;
    case "success":
      return colors.successSoft;
    case "warning":
      return colors.warningSoft;
    case "danger":
      return colors.dangerSoft;
    default:
      return colors.panelRaised;
  }
}

export function Badge(props: { label: string; tone?: Tone; title?: string }) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: toneBackground(props.tone),
        borderColor: toneColor(props.tone),
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 7,
        paddingVertical: 2,
        maxWidth: "100%",
      }}
      tooltip={props.title}
    >
      <Text
        style={{
          color: toneColor(props.tone),
          fontFamily: font.sans,
          fontSize: 10.5,
          fontWeight: "600",
          lineHeight: 14,
          numberOfLines: 1,
        }}
      >
        {props.label}
      </Text>
    </View>
  );
}

export function Button(props: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  compact?: boolean;
}) {
  const primary = props.variant === undefined || props.variant === "primary";
  const danger = props.variant === "danger";
  const ghost = props.variant === "ghost";
  const background = primary
    ? colors.accent
    : danger
      ? colors.dangerSoft
      : ghost
        ? "transparent"
        : colors.panelRaised;
  const border = primary
    ? colors.accentBorder
    : danger
      ? colors.danger
      : ghost
        ? "transparent"
        : colors.border;
  return (
    <View
      role="button"
      disabled={props.disabled}
      onPress={() => {
        if (!props.disabled) props.onPress();
      }}
      style={{
        alignSelf: "flex-start",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: background,
        borderColor: border,
        borderWidth: 1,
        borderRadius: 7,
        minHeight: props.compact ? 26 : 32,
        paddingHorizontal: props.compact ? 9 : 12,
        paddingVertical: props.compact ? 3 : 6,
        opacity: props.disabled ? 0.45 : 1,
      }}
      hoverStyle={{ opacity: props.disabled ? 0.45 : 0.86 }}
      activeStyle={{ opacity: 0.68 }}
      focusVisibleStyle={{ borderColor: colors.text, borderWidth: 2 }}
    >
      <Text
        style={{
          color: primary ? "#090a0f" : danger ? colors.danger : colors.text,
          fontFamily: font.sans,
          fontSize: props.compact ? 11.5 : 12.5,
          fontWeight: "600",
          lineHeight: 16,
          numberOfLines: 1,
        }}
      >
        {props.label}
      </Text>
    </View>
  );
}

export function IconButton(props: {
  label: string;
  icon: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: Tone;
}) {
  return (
    <View
      role="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={() => {
        if (!props.disabled) props.onPress();
      }}
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.panelRaised,
        borderColor: colors.borderSoft,
        borderWidth: 1,
        opacity: props.disabled ? 0.45 : 1,
      }}
      hoverStyle={{ backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }}
      activeStyle={{ opacity: 0.68 }}
    >
      <Text
        style={{
          color: toneColor(props.tone),
          fontSize: 15,
          fontWeight: "600",
          lineHeight: 18,
        }}
      >
        {props.icon}
      </Text>
    </View>
  );
}

export function SectionTitle(props: { title: string; detail?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text
        style={text({
          color: colors.faint,
          fontSize: 10.5,
          fontWeight: "700",
          letterSpacing: 0.8,
          textTransform: "uppercase",
        })}
      >
        {props.title}
      </Text>
      <If when={props.detail}>
        <Text style={text({ color: colors.muted, fontSize: 11, lineHeight: 15 })}>{props.detail}</Text>
      </If>
    </View>
  );
}

export function KeyValue(props: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", width: "100%" }}>
      <Text
        style={text({
          color: colors.faint,
          fontSize: 11,
          lineHeight: 16,
          width: 76,
          flexShrink: 0,
        })}
      >
        {props.label}
      </Text>
      <Text
        style={text({
          color: colors.text,
          fontSize: 11,
          lineHeight: 16,
          fontFamily: props.mono ? font.mono : font.sans,
          flex: 1,
          minWidth: 0,
          numberOfLines: 3,
          textOverflow: "ellipsis",
        })}
      >
        {props.value}
      </Text>
    </View>
  );
}

export function EmptyState(props: { title: string; detail: string; compact?: boolean }) {
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 28,
        paddingVertical: props.compact ? 20 : 52,
        width: "100%",
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          backgroundColor: colors.accentSoft,
          borderColor: colors.accentBorder,
          borderWidth: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: colors.accentStrong, fontSize: 20, fontWeight: "700" }}>F</Text>
      </View>
      <Text
        style={text({
          color: colors.textStrong,
          fontSize: props.compact ? 14 : 18,
          fontWeight: "650",
          textAlign: "center",
        })}
      >
        {props.title}
      </Text>
      <Text
        style={text({
          color: colors.muted,
          fontSize: props.compact ? 11.5 : 13,
          lineHeight: props.compact ? 17 : 20,
          textAlign: "center",
          maxWidth: 420,
        })}
      >
        {props.detail}
      </Text>
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.borderSoft, width: "100%" }} />;
}

export function surface(style?: ViewStyle): ViewStyle {
  return {
    backgroundColor: colors.panel,
    borderColor: colors.borderSoft,
    borderWidth: 1,
    borderRadius: 10,
    ...style,
  };
}
