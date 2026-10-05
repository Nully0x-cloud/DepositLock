import Image from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

type PropertyImageProps = {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
};

export function PropertyImage({
  src,
  alt,
  className,
  sizes = "(max-width: 768px) 100vw, 50vw",
  priority = false,
}: PropertyImageProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-sand-deep",
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <div
          role="img"
          aria-label={alt}
          className="grid h-full w-full place-items-center bg-gradient-to-br from-sand to-sand-deep text-subtle"
        >
          <ImageOff aria-hidden className="size-7" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}
