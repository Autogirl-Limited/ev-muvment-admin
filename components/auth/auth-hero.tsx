import Image from "next/image";

import { Logo } from "@/components/brand/logo";

/**
 * Decorative left half of the auth screens (lg and up). It is always dark,
 * whatever the theme, so text on it uses fixed light colours. Swap the image
 * by replacing public/auth-hero.svg (any aspect ratio: it is cropped to fit).
 */
export function AuthHero() {
  return (
    <aside className="relative isolate hidden overflow-hidden bg-[#03110d] text-white lg:sticky lg:top-0 lg:block lg:h-dvh">
      <Image
        src="/auth-hero.svg"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 0px"
        className="-z-20 object-cover"
      />
      {/* Scrim keeps the copy readable over any image. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/20 to-black/40" />

      <div className="flex h-full flex-col justify-between p-8 xl:p-12 2xl:p-16">
        <Logo className="text-white" />

        <div className="max-w-xl space-y-4 pb-2">
          <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight xl:text-4xl 2xl:text-5xl">
            Power your fleet, one charge at a time.
          </h2>
          <p className="max-w-md text-pretty text-base text-white/75 [@media(max-height:620px)]:hidden xl:text-lg">
            Manage drivers, vehicles and energy wallets from a single dashboard.
          </p>
        </div>
      </div>
    </aside>
  );
}
