import { ReviewVideos } from "@/components/batches/review-videos";
export const metadata = {title:"Revisar vídeos · PRINCIPAL"};
export default async function Page({params}:{params:Promise<{id:string}>}) { return <ReviewVideos batchId={Number((await params).id)} />; }
