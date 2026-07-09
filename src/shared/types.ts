export type PickLinkType = "" | "url" | "image" | "text";

export type PickItem = {
  id: string;
  name: string;
  avatar_image: string | null;
  avatar_url: string | null;
  intro: string | null;
  platform: string;
  link_type: PickLinkType;
  link_value: string | null;
  tags: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PickInput = {
  name: string;
  avatar_image?: string | null;
  intro?: string | null;
  platform?: string;
  link_type?: PickLinkType;
  link_value?: string | null;
  tags?: string[];
  sort_order?: number;
};
