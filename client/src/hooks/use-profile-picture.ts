import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Contact } from "@shared/schema";

export function useProfilePicture() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateProfilePictureMutation = useMutation({
    mutationFn: async ({ contactId, connectionId, forceRefresh = true }: { contactId: number; connectionId: number; forceRefresh?: boolean }) => {
      setIsUpdating(true);
      try {
        const res = await apiRequest(
          "POST",
          `/api/contacts/${contactId}/update-profile-picture`,
          { connectionId, forceRefresh }
        );
        return await res.json();
      } finally {
        setIsUpdating(false);
      }
    },
    onSuccess: (data: { noPicture?: boolean; profilePictureUrl?: string | null }, variables) => {

      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${variables.contactId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/group-conversations"] });


      queryClient.invalidateQueries({ queryKey: ['participant-profile-picture'] });
      queryClient.invalidateQueries({ queryKey: ['participant-profile-pictures'] });

      if (data.noPicture) {
        toast({
          title: "No profile picture",
          description: "This contact has no WhatsApp profile picture set."
        });
      } else {
        toast({
          title: "Profile picture updated",
          description: "Successfully fetched the contact's WhatsApp profile picture."
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update profile picture",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  return {
    updateProfilePicture: updateProfilePictureMutation.mutate,
    isUpdating,
    isError: updateProfilePictureMutation.isError,
    error: updateProfilePictureMutation.error
  };
}