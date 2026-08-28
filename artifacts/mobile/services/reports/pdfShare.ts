import * as Sharing from "expo-sharing";

type SharePdfOptions = {
  dialogTitle: string;
};

export async function sharePdfAsync(uri: string, options: SharePdfOptions) {
  if (!(await Sharing.isAvailableAsync())) {
    return false;
  }

  Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: options.dialogTitle,
    UTI: "com.adobe.pdf",
  }).catch(() => {
    // L'utilisateur peut annuler le partage ou l'impression. Ce n'est pas une erreur metier.
  });

  return true;
}
