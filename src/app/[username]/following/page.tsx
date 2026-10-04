import { FollowListPage } from "@/components/FollowListPage";

export const metadata = { title: "Following" };

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  return <FollowListPage username={(await params).username} kind="following" />;
}
