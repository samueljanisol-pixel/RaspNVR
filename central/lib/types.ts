export type CameraFeed = {
  key: string;
  store_id: string;
  store_code: string;
  store_name: string;
  camera_id: number;
  camera_name: string;
  tunnel_url: string;
  online: boolean;
};

export type ViewItem = {
  id: string;
  store_id: string;
  camera_id: number;
  sort_order: number;
};

export type LiveView = {
  id: string;
  name: string;
  sort_order: number;
  is_all: boolean;
  items: ViewItem[];
};

export type StoreRow = {
  id: string;
  code: string;
  name: string;
  online: boolean;
  device?: {
    hostname?: string;
    tunnel_url?: string;
    last_seen_at?: string;
    last_status?: {
      camera_count?: number;
      disk_used_percent?: number;
      cameras?: Array<{ id: number; name: string }>;
    };
  } | null;
};
