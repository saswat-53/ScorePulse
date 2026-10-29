import { View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

export type IconName =
  | "back"
  | "search"
  | "bell"
  | "bell-fill"
  | "home"
  | "calendar"
  | "bars"
  | "more"
  | "download"
  | "close"
  | "info"
  | "lock"
  | "pause"
  | "chevron-right"
  | "plus"
  | "user"
  | "sliders"
  | "sun"
  | "trash"
  | "cards"
  | "whistle"
  | "flag";

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

/** Stroke icons drawn on a 24x24 grid, matching the mockup's thin neon line style. */
export function Icon({ name, size = 22, color = "#FFFFFF" }: IconProps) {
  const stroke = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  return (
    <View aria-hidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {name === "back" && <Path d="M19 12H5M11 6l-6 6 6 6" {...stroke} />}
        {name === "search" && (
          <>
            <Circle cx="11" cy="11" r="7" {...stroke} />
            <Path d="M20 20l-4-4" {...stroke} />
          </>
        )}
        {name === "bell" && (
          <Path
            d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"
            {...stroke}
          />
        )}
        {name === "bell-fill" && (
          <Path
            d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"
            {...stroke}
            fill={color}
          />
        )}
        {name === "home" && (
          <Path
            d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"
            {...stroke}
          />
        )}
        {name === "calendar" && (
          <>
            <Rect x="3" y="4" width="18" height="17" rx="2" {...stroke} />
            <Path d="M3 9h18M8 2v4M16 2v4" {...stroke} />
          </>
        )}
        {name === "bars" && <Path d="M5 21V11M12 21V4M19 21v-7" {...stroke} />}
        {name === "more" && (
          <>
            <Circle cx="5" cy="12" r="1.6" fill={color} />
            <Circle cx="12" cy="12" r="1.6" fill={color} />
            <Circle cx="19" cy="12" r="1.6" fill={color} />
          </>
        )}
        {name === "download" && (
          <Path d="M12 4v11M7 11l5 5 5-5M5 20h14" {...stroke} />
        )}
        {name === "close" && <Path d="M6 6l12 12M18 6L6 18" {...stroke} />}
        {name === "info" && (
          <>
            <Circle cx="12" cy="12" r="9" {...stroke} />
            <Path d="M12 8h.01M12 12v4" {...stroke} />
          </>
        )}
        {name === "lock" && (
          <>
            <Rect x="5" y="11" width="14" height="10" rx="2" {...stroke} />
            <Path d="M8 11V8a4 4 0 0 1 8 0v3" {...stroke} />
          </>
        )}
        {name === "pause" && (
          <>
            <Rect x="6" y="5" width="4" height="14" rx="1" fill={color} />
            <Rect x="14" y="5" width="4" height="14" rx="1" fill={color} />
          </>
        )}
        {name === "chevron-right" && <Path d="M9 6l6 6-6 6" {...stroke} />}
        {name === "plus" && <Path d="M12 5v14M5 12h14" {...stroke} />}
        {name === "user" && (
          <>
            <Circle cx="12" cy="8" r="4" {...stroke} />
            <Path d="M4 21a8 8 0 0 1 16 0" {...stroke} />
          </>
        )}
        {name === "sliders" && (
          <Path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" {...stroke} />
        )}
        {name === "sun" && (
          <>
            <Circle cx="12" cy="12" r="4" {...stroke} />
            <Path
              d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"
              {...stroke}
            />
          </>
        )}
        {name === "trash" && (
          <Path
            d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
            {...stroke}
          />
        )}
        {name === "cards" && (
          <>
            <Rect x="4" y="6" width="9" height="13" rx="1.5" {...stroke} />
            <Path d="M15 8l5 1-2.5 9-4-1" {...stroke} />
          </>
        )}
        {name === "whistle" && (
          <>
            <Circle cx="9" cy="14" r="5" {...stroke} />
            <Path d="M13 10l8-3M9 14h.01" {...stroke} />
          </>
        )}
        {name === "flag" && <Path d="M5 21V4M5 4h12l-2 4 2 4H5" {...stroke} />}
      </Svg>
    </View>
  );
}
