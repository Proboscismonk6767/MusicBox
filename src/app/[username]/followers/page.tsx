import { FollowListPage } from "@/components/FollowListPage";

export const metadata = { title: "Followers" };

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  return <FollowListPage username={(await params).username} kind="followers" />;
}
