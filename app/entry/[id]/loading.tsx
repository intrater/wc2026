import { SkeletonCard, SkeletonHeader } from "@/components/Skeleton";

export default function EntryLoading() {
  return (
    <div className="space-y-5">
      <SkeletonHeader />
      <SkeletonCard rows={4} />
      <SkeletonCard rows={8} />
    </div>
  );
}
