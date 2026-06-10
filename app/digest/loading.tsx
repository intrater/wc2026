import { SkeletonCard, SkeletonHeader } from "@/components/Skeleton";

export default function DigestLoading() {
  return (
    <div className="space-y-5">
      <SkeletonHeader />
      <SkeletonCard rows={3} />
      <SkeletonCard rows={5} />
    </div>
  );
}
