import { useState } from "react";
import { cn } from "@/lib/utils";

interface MemberAvatarProps {
  src: string | null;
  initials: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  alt?: string;
}

const SIZE_CLASS: Record<NonNullable<MemberAvatarProps["size"]>, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-24 w-24 text-2xl",
};

export function MemberAvatar({
  src,
  initials,
  size = "sm",
  className,
  alt,
}: MemberAvatarProps) {
  const [errored, setErrored] = useState(false);
  const showImage = !!src && !errored;

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-zinc-800 text-zinc-100 font-semibold overflow-hidden ring-1 ring-zinc-700/60 select-none shrink-0",
        SIZE_CLASS[size],
        className,
      )}
      aria-label={alt}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt ?? initials}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </div>
  );
}

export default MemberAvatar;
