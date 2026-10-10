export function saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    // Revoke after the click has been handled so the download can start
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
