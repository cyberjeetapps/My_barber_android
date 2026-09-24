export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  location: string;
  gender: string;
  imageUrl: string;
}

export interface NewService {
  name: string;
  description: string;
  price: string;
  duration: string;
  location: string;
  gender: string;
  imageUrl: string;
}
