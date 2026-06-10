import { SkeletonCard, SkeletonHeader } from "@/components/Skeleton";

export default function HomeLoading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader />
      <SkeletonCard rows={2} />
      <SkeletonCard rows={8} />
    </div>
  );
}
