export interface PublicUser {
  id: string;
  email: string;
  role: string;
  status: string;
  active: boolean;
  createdAt: string;
}

export interface ActiveStatus {
  id: string;
  active: boolean;
}
