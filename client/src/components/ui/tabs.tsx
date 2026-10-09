import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "cn"

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col", className)}
      {...props}
    />
  )
}

// Text labels on a hairline; the active one gets a cobalt rule and a filled dot.
function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "flex items-center gap-6 border-b border-border text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  children,
  ...props
}: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "group/tabs-trigger relative inline-flex h-10 shrink-0 items-center gap-2 text-sm font-medium whitespace-nowrap transition-colors duration-200 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-primary after:opacity-0 after:transition-opacity after:duration-200 hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-active:text-foreground data-active:after:opacity-100",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className="size-2 rounded-full border border-muted-foreground transition-colors duration-200 group-data-active/tabs-trigger:border-primary group-data-active/tabs-trigger:bg-primary"
      />
      {children}
    </TabsPrimitive.Tab>
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
