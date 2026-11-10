import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

export default function Loading() {
  return <div className="mx-auto w-full min-w-0 max-w-[1120px] px-4 py-6 md:px-6 lg:py-10 xl:px-8">
    <LoadingSkeleton />
  </div>;
}
