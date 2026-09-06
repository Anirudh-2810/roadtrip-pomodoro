import { getUser } from "@/lib/supabase/server";
import RoadtripExperience from "@/components/roadtrip/RoadtripExperience";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getUser();
  const email = user?.email ?? null;

  return (
    <div className="min-h-screen">
      <RoadtripExperience userEmail={email} />
    </div>
  );
}
