import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, CheckboxField, Modal, TextField } from "@renderer/components";
import { useAppSelector } from "@renderer/hooks";

import "./custom-download-modal.scss";

export interface CustomDownloadModalProps {
  visible: boolean;
  onClose: () => void;
  startDownload: (
    uri: string,
    downloadPath: string,
    automaticallyExtract: boolean,
    automaticallyDeleteArchiveFiles: boolean,
    signal?: AbortSignal
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function CustomDownloadModal({
  visible,
  onClose,
  startDownload,
}: CustomDownloadModalProps) {
  const { t } = useTranslation("game_details");

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const [uri, setUri] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [automaticExtractionEnabled, setAutomaticExtractionEnabled] = useState(
    userPreferences?.extractFilesByDefault ?? true
  );
  const [
    deleteArchiveFilesAfterExtraction,
    setDeleteArchiveFilesAfterExtraction,
  ] = useState(
    userPreferences?.deleteArchiveFilesAfterExtractionByDefault ?? false
  );
  const [downloadStarting, setDownloadStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    setUri("");
    setError(null);
    setAutomaticExtractionEnabled(
      userPreferences?.extractFilesByDefault ?? true
    );
    setDeleteArchiveFilesAfterExtraction(
      userPreferences?.deleteArchiveFilesAfterExtractionByDefault ?? false
    );

    const resolveDefaultPath = async () => {
      if (userPreferences?.downloadsPath) {
        setSelectedPath(userPreferences.downloadsPath);
        return;
      }

      const defaultDownloadsPath =
        await globalThis.electron.getDefaultDownloadsPath();

      setSelectedPath(defaultDownloadsPath);
    };

    void resolveDefaultPath();
  }, [
    visible,
    userPreferences?.downloadsPath,
    userPreferences?.extractFilesByDefault,
    userPreferences?.deleteArchiveFilesAfterExtractionByDefault,
  ]);

  const handleChooseDownloadsPath = async () => {
    const { filePaths } = await globalThis.electron.showOpenDialog({
      defaultPath: selectedPath,
      properties: ["openDirectory"],
    });

    if (filePaths && filePaths.length > 0) {
      setSelectedPath(filePaths[0]);
    }
  };

  const handlePaste = async () => {
    try {
      const clipboardText = await globalThis.electron.clipboard.readText();

      setUri(clipboardText);
      setError(null);
    } catch {
      setError(t("clipboard_read_failed"));
    }
  };

  const handleDownload = async () => {
    setError(null);

    const trimmedUri = uri.trim();

    try {
      const parsedUrl = new URL(trimmedUri);

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        setError(t("invalid_download_url"));
        return;
      }
    } catch {
      setError(t("invalid_download_url"));
      return;
    }

    if (!selectedPath) {
      setError(t("download_path_required"));
      return;
    }

    setDownloadStarting(true);

    try {
      const response = await startDownload(
        trimmedUri,
        selectedPath,
        automaticExtractionEnabled,
        deleteArchiveFilesAfterExtraction
      );

      if (!response.ok) {
        setError(response.error ?? t("download_failed"));
      }
    } finally {
      setDownloadStarting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      title={t("custom_download_title")}
      description={t("custom_download_description")}
      onClose={onClose}
    >
      <div className="custom-download-modal__content">
        <TextField
          label={t("download_url")}
          value={uri}
          onChange={(event) => {
            setUri(event.target.value);
            setError(null);
          }}
          placeholder="https://..."
          error={error}
          disabled={downloadStarting}
          rightContent={
            <Button
              theme="outline"
              onClick={handlePaste}
              disabled={downloadStarting}
            >
              {t("paste")}
            </Button>
          }
        />

        <TextField
          value={selectedPath}
          readOnly
          disabled
          label={t("download_path")}
          rightContent={
            <Button
              theme="outline"
              onClick={handleChooseDownloadsPath}
              disabled={downloadStarting}
            >
              {t("change")}
            </Button>
          }
        />

        <CheckboxField
          label={t("automatically_extract_downloaded_files")}
          checked={automaticExtractionEnabled}
          onChange={() =>
            setAutomaticExtractionEnabled(!automaticExtractionEnabled)
          }
        />

        <CheckboxField
          label={t("delete_archive_files_after_extraction")}
          checked={deleteArchiveFilesAfterExtraction}
          onChange={() =>
            setDeleteArchiveFilesAfterExtraction(
              !deleteArchiveFilesAfterExtraction
            )
          }
        />

        <div className="custom-download-modal__actions">
          <Button onClick={onClose} theme="outline" disabled={downloadStarting}>
            {t("cancel")}
          </Button>

          <Button
            onClick={handleDownload}
            disabled={downloadStarting || !uri.trim() || !selectedPath}
          >
            {t("download")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
