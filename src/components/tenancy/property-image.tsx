import Image from "next/image";
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
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    </div>
  );
}
