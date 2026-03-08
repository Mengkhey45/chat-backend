// TODO: Update the import path below to the correct location of FriendRequest, or define the model here if it does not exist.
export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}