export interface AmpInstance {
  id: string;
  name: string;
  module: string;
  running: boolean;
  state: string;
  active_users: number | null;
  max_users: number | null;
  port: number | null;
  steam_app_id: number | null;
  game: string | null;
}
