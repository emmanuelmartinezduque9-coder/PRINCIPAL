"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AUTO, AvatarSelect, KEEP, NONE, type AvatarChoice } from "@/components/batches/batch-fields";
import type { ProductPhoto } from "@/components/videos/labels";
import { api } from "@/lib/api";
import { startingAvatar } from "@/lib/default-avatar";
import type { ProductView } from "./labels";

/**
 * Avatar habitual del producto: con el que empiezan sus vídeos nuevos y las tarjetas del lote.
 * Una foto de avatar, «Sin sustitución» o «No aparece nadie»; sin fotos de avatar, «Automático»
 * (lo que reciben entonces las tarjetas del lote).
 */
export function DefaultAvatar({ product }: { product: ProductView }) {
  const client = useQueryClient();
  const photos = useQuery({
    queryKey: ["photos", product.id],
    queryFn: () => api<{ photos: ProductPhoto[] }>(`/api/productos/${product.id}/fotos`),
  });
  const avatars = (photos.data?.photos ?? []).filter((photo) => photo.role === "avatar");
  const start = startingAvatar(product, avatars.map((photo) => photo.id));
  const value: AvatarChoice = start.avatarMode === "elegido" ? start.avatarPhotoId! : start.avatarMode;

  async function choose(choice: AvatarChoice) {
    // «Automático» es lo que ya hay sin fotos de avatar: no se guarda nada.
    if (choice === AUTO) return;
    const body = typeof choice === "number" ? { defaultAvatarPhotoId: choice } : { defaultAvatarMode: choice === KEEP ? KEEP : NONE };
    const key = ["product", String(product.id)];
    const before = client.getQueryData<{ product: ProductView }>(key);
    // Se ve al instante; si el servidor no lo acepta, vuelve a como estaba.
    client.setQueryData<{ product: ProductView }>(key, (data) =>
      data
        ? {
            product: {
              ...data.product,
              defaultAvatarMode: typeof choice === "number" ? "elegido" : choice,
              defaultAvatarPhotoId: typeof choice === "number" ? choice : null,
            },
          }
        : data,
    );
    try {
      await api(`/api/productos/${product.id}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch (error) {
      if (before) client.setQueryData(key, before);
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: ["products"] });
    }
  }

  return (
    <div className="w-48" title="Avatar habitual">
      <AvatarSelect avatars={avatars} loading={photos.isLoading} value={value} onChange={(choice) => void choose(choice)} label="Avatar habitual" autoOption={value === AUTO} className="h-8" />
    </div>
  );
}
