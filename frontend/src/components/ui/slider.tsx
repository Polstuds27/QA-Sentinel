import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { cn } from "cn"

// A hairline with a cobalt dot: the played part of the line darkens to foreground.
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="center"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full cursor-pointer touch-none items-center select-none data-disabled:cursor-default data-horizontal:h-6 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-6 data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow bg-border select-none data-horizontal:h-px data-horizontal:w-full data-vertical:h-full data-vertical:w-px"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-foreground select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="relative block size-3 shrink-0 rounded-full bg-primary outline-offset-2 outline-ring transition-transform duration-200 select-none after:absolute after:-inset-2 hover:scale-125 has-focus-visible:outline-2 data-disabled:bg-muted-foreground data-dragging:scale-125"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
