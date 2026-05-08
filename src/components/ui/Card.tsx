import React, { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const card = cva(
  "bg-white rounded-xl border border-neutral-200 shadow-sm",
  {
    variants: {
      padding: {
        none: "",
        sm: "p-3",
        md: "p-4",
        lg: "p-6",
      },
    },
    defaultVariants: { padding: "md" },
  }
);

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof card> {}

interface CardComponent
  extends React.ForwardRefExoticComponent<CardProps & React.RefAttributes<HTMLDivElement>> {
  Header: React.FC<HTMLAttributes<HTMLDivElement>>;
  Body: React.FC<HTMLAttributes<HTMLDivElement>>;
  Footer: React.FC<HTMLAttributes<HTMLDivElement>>;
}

const CardBase = forwardRef<HTMLDivElement, CardProps>(({ className, padding, children, ...props }, ref) => {
  return (
    <div ref={ref} className={cn(card({ padding }), className)} {...props}>
      {children}
    </div>
  );
}) as CardComponent;
CardBase.displayName = "Card";

const CardHeader: React.FC<HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn("border-b border-neutral-200 pb-3 mb-3 last:mb-0 last:border-b-0 last:pb-0", className)} {...props}>
    {children}
  </div>
);
CardHeader.displayName = "Card.Header";

const CardBody: React.FC<HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn("text-sm text-neutral-700", className)} {...props}>
    {children}
  </div>
);
CardBody.displayName = "Card.Body";

const CardFooter: React.FC<HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn("border-t border-neutral-200 pt-3 mt-3 first:mt-0 first:border-t-0 first:pt-0", className)} {...props}>
    {children}
  </div>
);
CardFooter.displayName = "Card.Footer";

CardBase.Header = CardHeader;
CardBase.Body = CardBody;
CardBase.Footer = CardFooter;

export default CardBase;
export { card as cardStyles };
