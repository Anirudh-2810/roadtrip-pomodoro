import * as React from "react";

export function Button({
  variant = "default",
  size = "default",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg";
}) {
  const base =
    "inline-flex items-center justify-center rounded-full font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20";
  const variants: Record<string, string> = {
    default: "bg-white text-black hover:bg-zinc-200",
    ghost: "bg-transparent text-zinc-400 hover:bg-white/10 hover:text-white",
    outline:
      "border border-white/10 bg-transparent text-white hover:bg-white/10",
  };
  const sizes: Record<string, string> = {
    default: "h-10 px-6 text-sm",
    sm: "h-8 px-4 text-xs",
    lg: "h-12 px-8 text-base",
  };
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
