"use client"

import * as React from "react"
import useEmblaCarousel from "embla-carousel-react"
import { ArrowLeft, ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const CarouselContext = React.createContext(null)

function useCarousel() {
  const ctx = React.useContext(CarouselContext)
  if (!ctx) {
    throw new Error("useCarousel must be used within <Carousel />")
  }
  return ctx
}

const Carousel = React.forwardRef(
  (
    {
      orientation = "horizontal",
      opts,
      setApi,
      plugins,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const [emblaRef, api] = useEmblaCarousel(
      {
        ...opts,
        axis: orientation === "horizontal" ? "x" : "y",
      },
      plugins
    )

    const [canPrev, setCanPrev] = React.useState(false)
    const [canNext, setCanNext] = React.useState(false)

    const updateState = React.useCallback((embla) => {
      if (!embla) return
      setCanPrev(embla.canScrollPrev())
      setCanNext(embla.canScrollNext())
    }, [])

    React.useEffect(() => {
      if (api && setApi) setApi(api)
    }, [api, setApi])

    React.useEffect(() => {
      if (!api) return

      updateState(api)

      api.on("select", updateState)
      api.on("reInit", updateState)

      return () => {
        api.off("select", updateState)
        api.off("reInit", updateState)
      }
    }, [api, updateState])

    const scrollPrev = React.useCallback(() => {
      api?.scrollPrev()
    }, [api])

    const scrollNext = React.useCallback(() => {
      api?.scrollNext()
    }, [api])

    const handleKeyDown = React.useCallback(
      (e) => {
        if (e.key === "ArrowLeft") scrollPrev()
        if (e.key === "ArrowRight") scrollNext()
      },
      [scrollPrev, scrollNext]
    )

    const value = React.useMemo(
      () => ({
        api,
        emblaRef,
        orientation,
        scrollPrev,
        scrollNext,
        canPrev,
        canNext,
      }),
      [api, emblaRef, orientation, scrollPrev, scrollNext, canPrev, canNext]
    )

    return (
      <CarouselContext.Provider value={value}>
        <div
          ref={ref}
          role="region"
          aria-roledescription="carousel"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className={cn("relative", className)}
          {...props}
        >
          {children}
        </div>
      </CarouselContext.Provider>
    )
  }
)

Carousel.displayName = "Carousel"

const CarouselContent = React.forwardRef(({ className, ...props }, ref) => {
  const { emblaRef, orientation } = useCarousel()

  return (
    <div ref={emblaRef} className="overflow-hidden">
      <div
        ref={ref}
        className={cn(
          "flex",
          orientation === "horizontal" ? "-ml-4" : "-mt-4 flex-col",
          className
        )}
        {...props}
      />
    </div>
  )
})

CarouselContent.displayName = "CarouselContent"

const CarouselItem = React.forwardRef(({ className, ...props }, ref) => {
  const { orientation } = useCarousel()

  return (
    <div
      ref={ref}
      role="group"
      aria-roledescription="slide"
      className={cn(
        "min-w-0 shrink-0 grow-0 basis-full",
        orientation === "horizontal" ? "pl-4" : "pt-4",
        className
      )}
      {...props}
    />
  )
})

CarouselItem.displayName = "CarouselItem"

const CarouselPrevious = React.forwardRef(
  ({ className, variant = "outline", size = "icon", ...props }, ref) => {
    const { orientation, scrollPrev, canPrev } = useCarousel()

    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        disabled={!canPrev}
        onClick={scrollPrev}
        className={cn(
          "absolute h-8 w-8 rounded-full",
          orientation === "horizontal"
            ? "-left-12 top-1/2 -translate-y-1/2"
            : "-top-12 left-1/2 -translate-x-1/2 rotate-90",
          className
        )}
        {...props}
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="sr-only">Previous slide</span>
      </Button>
    )
  }
)

CarouselPrevious.displayName = "CarouselPrevious"

const CarouselNext = React.forwardRef(
  ({ className, variant = "outline", size = "icon", ...props }, ref) => {
    const { orientation, scrollNext, canNext } = useCarousel()

    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        disabled={!canNext}
        onClick={scrollNext}
        className={cn(
          "absolute h-8 w-8 rounded-full",
          orientation === "horizontal"
            ? "-right-12 top-1/2 -translate-y-1/2"
            : "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
          className
        )}
        {...props}
      >
        <ArrowRight className="h-4 w-4" />
        <span className="sr-only">Next slide</span>
      </Button>
    )
  }
)

CarouselNext.displayName = "CarouselNext"

export {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
}