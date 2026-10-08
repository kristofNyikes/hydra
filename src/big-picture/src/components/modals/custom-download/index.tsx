import { useCallback, useEffect, useState } from "react";

import {
  Button,
  Checkbox,
  GridFocusGroup,
  Input,
  Modal,
  UserDiskItem,
  VerticalFocusGroup,
} from "../../common";

import { useTranslation } from "react-i18next";

import { Downloader, resolveDownloadDirectories } from "@shared";
import type { GameShop } from "@types";

import { useUserPreferences } from "../../../hooks";

import "./styles.scss";

interface DownloadDirectorySuggestion {
  title: string;
  path: string;
  freeBytes: number | null;
  totalBytes: number | null;
}

interface CustomDownloadModalProps {
  visible: boolean;
  onClose: () => void;
  game: {
    objectId: string;
    shop: GameShop;
    title: string;
  };
}

export function CustomDownloadModal({
  visible,
  onClose,
  game,
}: Readonly<CustomDownloadModalProps>) {
  const userPreferences = useUserPreferences();

  const [uri, setUri] = useState("");
  const [downloadDirectorySuggestions, setDownloadDirectorySuggestions] =
    useState<DownloadDirectorySuggestion[]>([]);
  const [selectedDownloadPath, setSelectedDownloadPath] = useState("");

  const [automaticExtractionEnabled, setAutomaticExtractionEnabled] =
    useState(true);
  const [
    deleteArchiveFilesAfterExtraction,
    setDeleteArchiveFilesAfterExtraction,
  ] = useState(false);

  const [isPreparingOptions, setIsPreparingOptions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { t } = useTranslation("big_picture");

  useEffect(() => {
    if (!visible) {
      setUri("");
      setDownloadDirectorySuggestions([]);
      setSelectedDownloadPath("");
      setAutomaticExtractionEnabled(true);
      setDeleteArchiveFilesAfterExtraction(false);
      setIsPreparingOptions(false);
      setIsSubmitting(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const prepareOptions = async () => {
      setIsPreparingOptions(true);
      setError(null);

      try {
        const defaultDownloadsPath =
          await globalThis.window.electron.getDefaultDownloadsPath();

        const resolvedDirectories = resolveDownloadDirectories(
          userPreferences,
          defaultDownloadsPath
        );

        const suggestions = await Promise.all(
          resolvedDirectories.allPaths.map(async (path) => {
            let diskUsage: {
              free: number;
              total: number;
            } | null = null;

            try {
              diskUsage =
                await globalThis.window.electron.getDiskFreeSpace(path);
            } catch {
              diskUsage = null;
            }

            return {
              title: path,
              path,
              freeBytes: diskUsage?.free ?? null,
              totalBytes: diskUsage?.total ?? null,
            };
          })
        );

        if (cancelled) return;

        setDownloadDirectorySuggestions(suggestions);
        setSelectedDownloadPath(resolvedDirectories.defaultPath);
        setAutomaticExtractionEnabled(
          userPreferences?.extractFilesByDefault ?? true
        );
        setDeleteArchiveFilesAfterExtraction(
          userPreferences?.deleteArchiveFilesAfterExtractionByDefault ?? false
        );
      } catch {
        if (!cancelled) {
          setError(t("Failed to prepare download settings."));
        }
      } finally {
        if (!cancelled) {
          setIsPreparingOptions(false);
        }
      }
    };

    void prepareOptions();

    return () => {
      cancelled = true;
    };
  }, [visible, userPreferences, t]);

  const handleSelectDownloadPath = useCallback((path: string) => {
    setSelectedDownloadPath(path);
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await globalThis.window.electron.clipboard.readText();

      if (text.trim()) {
        setUri(text.trim());
        setError(null);
      }
    } catch {
      setError(t("Failed to read the clipboard."));
    }
  }, [t]);

  const handleStartDownload = useCallback(async () => {
    const trimmedUri = uri.trim();

    if (!trimmedUri || !selectedDownloadPath) {
      return;
    }

    try {
      const parsedUrl = new URL(trimmedUri);

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        setError(t("Please enter a valid HTTP or HTTPS URL."));
        return;
      }
    } catch {
      setError(t("Please enter a valid HTTP or HTTPS URL."));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const payload = {
      objectId: game.objectId,
      title: game.title,
      shop: game.shop,
      uri: trimmedUri,
      downloadPath: selectedDownloadPath,
      downloader: Downloader.Custom,
      automaticallyExtract: automaticExtractionEnabled,
      automaticallyDeleteArchiveFiles: deleteArchiveFilesAfterExtraction,
    } as const;

    try {
      const library = await globalThis.window.electron.getLibrary();
      const shouldQueue = library.some((libraryGame) => {
        const download = libraryGame.download;

        return Boolean(
          download &&
            (download.status === "active" ||
              download.status === "extracting" ||
              download.extracting)
        );
      });

      const response = shouldQueue
        ? await globalThis.window.electron.addGameToQueue(payload)
        : await globalThis.window.electron.startGameDownload(payload);

      if (response.ok) {
        onClose();
        return;
      }

      setError(response.error ?? t("Failed to start download."));
    } catch {
      setError(t("Failed to start download."));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    automaticExtractionEnabled,
    deleteArchiveFilesAfterExtraction,
    game,
    onClose,
    selectedDownloadPath,
    uri,
    t,
  ]);

  return (
    <Modal
      visible={visible}
      title={t("Custom Download")}
      description={t("Download from a custom URL")}
      onClose={onClose}
    >
      <VerticalFocusGroup className="custom-download-modal">
        <div className="custom-download-modal__url">
          <div className="custom-download-modal__url-row">
            <Input
              value={uri}
              onChange={(event) => {
                setUri(event.target.value);
                setError(null);
              }}
              placeholder="https://..."
              label={t("Download URL")}
              disabled={isSubmitting}
            />

            <Button onClick={handlePaste} disabled={isSubmitting}>
              {t("Paste")}
            </Button>
          </div>

          {error && <p className="custom-download-modal__error">{error}</p>}
        </div>

        <div className="custom-download-modal__directory">
          <div className="custom-download-modal__directory-copy">
            <p className="custom-download-modal__directory-label">
              {t("Download directory")}
            </p>
            <p className="custom-download-modal__directory-description">
              {t("Select where the download should be saved.")}
            </p>
          </div>

          <GridFocusGroup
            className="custom-download-modal__directory-disks"
            style={{
              display: "grid",
              width: "100%",
              alignItems: "stretch",
              gap: "calc(var(--spacing-unit) * 2)",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            }}
          >
            {downloadDirectorySuggestions.map((directory, index) => {
              const shouldSpanFullWidth =
                downloadDirectorySuggestions.length % 2 === 1 &&
                index === downloadDirectorySuggestions.length - 1;

              return (
                <UserDiskItem
                  key={directory.path}
                  title={directory.title}
                  path={directory.path}
                  freeBytes={directory.freeBytes}
                  totalBytes={directory.totalBytes}
                  isSelected={selectedDownloadPath === directory.path}
                  showSelectedIndicator
                  stealFocusOnAppear={index === 0}
                  onClick={
                    isPreparingOptions || isSubmitting
                      ? undefined
                      : () => handleSelectDownloadPath(directory.path)
                  }
                  focusNavigationState={
                    isPreparingOptions || isSubmitting ? "disabled" : undefined
                  }
                  className={
                    shouldSpanFullWidth
                      ? "custom-download-modal__directory-disk custom-download-modal__directory-disk--full-width"
                      : "custom-download-modal__directory-disk"
                  }
                />
              );
            })}
          </GridFocusGroup>
        </div>

        <div className="custom-download-modal__download-options">
          <Checkbox
            block
            label={t("Automatically extract downloaded files")}
            checked={automaticExtractionEnabled}
            disabled={isPreparingOptions || isSubmitting}
            onChange={() =>
              setAutomaticExtractionEnabled(!automaticExtractionEnabled)
            }
          />

          <Checkbox
            block
            label={t("Always delete archive files after extraction")}
            checked={deleteArchiveFilesAfterExtraction}
            disabled={isPreparingOptions || isSubmitting}
            onChange={() =>
              setDeleteArchiveFilesAfterExtraction(
                !deleteArchiveFilesAfterExtraction
              )
            }
          />
        </div>

        <div className="custom-download-modal__actions">
          <Button onClick={onClose} disabled={isSubmitting}>
            {t("Cancel")}
          </Button>

          <Button
            loading={isSubmitting}
            disabled={
              isPreparingOptions ||
              isSubmitting ||
              !uri.trim() ||
              !selectedDownloadPath
            }
            onClick={handleStartDownload}
          >
            {isSubmitting ? t("Starting...") : t("Download")}
          </Button>
        </div>
      </VerticalFocusGroup>
    </Modal>
  );
}
