"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"
import { cn } from "@/lib/utils"

const THEMES = {
  light: "",
  dark: ".dark",
}

const ChartContext = React.createContext(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }
  return context
}

const ChartContainer = React.forwardRef(
  ({ id, className, children, config, ...props }, ref) => {
    const uniqueId = React.useId()
    const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

    return (
      <ChartContext.Provider value={{ config }}>
        <div
          data-chart={chartId}
          ref={ref}
          className={cn(
            "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-layer]:outline-none",
            className
          )}
          {...props}
        >
          <ChartStyle id={chartId} config={config} />
          <RechartsPrimitive.ResponsiveContainer>
            {children}
          </RechartsPrimitive.ResponsiveContainer>
        </div>
      </ChartContext.Provider>
    )
  }
)

ChartContainer.displayName = "ChartContainer"

const ChartStyle = ({ id, config }) => {
  const colorConfig = Object.entries(config || {}).filter(
    ([, c]) => c?.theme || c?.color
  )

  if (!colorConfig.length) return null

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(([theme, prefix]) => {
            const vars = colorConfig
              .map(([key, item]) => {
                const color = item?.theme?.[theme] || item?.color
                return color ? `  --color-${key}: ${color};` : ""
              })
              .join("\n")

            return `
${prefix} [data-chart=${id}] {
${vars}
}
`
          })
          .join("\n"),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

const ChartTooltipContent = React.forwardRef(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      labelKey,
    },
    ref
  ) => {
    const { config } = useChart()

    if (!active || !payload?.length) return null

    const first = payload[0]

    const resolvedKey =
      labelKey ||
      first?.dataKey ||
      first?.name ||
      "value"

    const itemConfig =
      getPayloadConfigFromPayload(config, first, resolvedKey)

    const tooltipLabel = !hideLabel ? (
      <div className={cn("font-medium", labelClassName)}>
        {labelFormatter
          ? labelFormatter(label ?? itemConfig?.label, payload)
          : label ?? itemConfig?.label}
      </div>
    ) : null

    const nestLabel = payload.length === 1 && indicator !== "dot"

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl",
          className
        )}
      >
        {!nestLabel && tooltipLabel}

        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            const key =
              nameKey ||
              item.name ||
              item.dataKey ||
              "value"

            const cfg = getPayloadConfigFromPayload(config, item, key)
            const indicatorColor = color || item.color || item.payload?.fill

            const value =
              typeof item.value === "number"
                ? item.value.toLocaleString()
                : item.value

            return (
              <div
                key={item.dataKey || index}
                className={cn(
                  "flex w-full gap-2",
                  indicator === "dot" && "items-center"
                )}
              >
                {!hideIndicator && (
                  <div
                    className={cn(
                      "shrink-0 rounded-[2px]",
                      indicator === "dot" && "h-2.5 w-2.5",
                      indicator === "line" && "w-1",
                      indicator === "dashed" &&
                        "w-0 border border-dashed bg-transparent"
                    )}
                    style={{
                      backgroundColor: indicatorColor,
                      borderColor: indicatorColor,
                    }}
                  />
                )}

                <div className="flex flex-1 justify-between gap-2">
                  <span className="text-muted-foreground">
                    {cfg?.label || item.name}
                  </span>

                  {formatter
                    ? formatter(item.value, item.name, item, index)
                    : value != null && (
                        <span className="font-mono tabular-nums">
                          {value}
                        </span>
                      )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)

ChartTooltipContent.displayName = "ChartTooltipContent"

const ChartLegend = RechartsPrimitive.Legend

const ChartLegendContent = React.forwardRef(
  ({ className, payload, hideIcon = false, nameKey }, ref) => {
    const { config } = useChart()

    if (!payload?.length) return null

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-center gap-4 pt-3",
          className
        )}
      >
        {payload.map((item, index) => {
          const key = nameKey || item.dataKey || "value"
          const cfg = getPayloadConfigFromPayload(config, item, key)

          return (
            <div key={item.value || index} className="flex items-center gap-1.5">
              {!hideIcon && (
                <div
                  className="h-2 w-2 rounded-[2px]"
                  style={{ backgroundColor: item.color }}
                />
              )}
              {cfg?.label || item.value}
            </div>
          )
        })}
      </div>
    )
  }
)

ChartLegendContent.displayName = "ChartLegendContent"

function getPayloadConfigFromPayload(config, payload, key) {
  if (!payload || typeof payload !== "object") return undefined

  const payloadData = payload?.payload

  let resolvedKey = key

  if (typeof payload[key] === "string") {
    resolvedKey = payload[key]
  } else if (payloadData?.[key]) {
    resolvedKey = payloadData[key]
  }

  return config?.[resolvedKey] || config?.[key]
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
}