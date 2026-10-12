export interface PublicUser {
  id: string;
  email: string;
  role: string;
  emailConfirmed: boolean;
  active: boolean;
  createdAt: string;
}

export interface ActiveStatus {
  id: string;
  active: boolean;
}
