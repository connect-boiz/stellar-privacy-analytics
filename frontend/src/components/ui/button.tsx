import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { hapticFeedback } from "@/utils/haptics"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 touch-manipulation active:opacity-80 select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2 min-w-[44px]", // Increased height for mobile friendliness
        sm: "h-10 rounded-md px-3 min-w-[40px]", // Minimum tap target size 40px
        lg: "h-12 rounded-md px-8 min-w-[44px]",
        icon: "h-11 w-11", // Standard icon tap target
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  enableHaptics?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, enableHaptics = true, onClick, ...props }, ref) => {
    const lastClickTime = React.useRef(0);
    const Comp = asChild ? Slot : "button"

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      const now = Date.now();
      // Simple double-tap prevention (300ms)
      if (now - lastClickTime.current < 300) {
        e.preventDefault();
        return;
      }
      lastClickTime.current = now;

      if (enableHaptics) {
        hapticFeedback.light();
      }
      
      if (onClick) {
        onClick(e);
      }
    };

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
