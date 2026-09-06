import { useState, useRef, ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, X, FileIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  fileType?: string;
  maxSize?: number;
  className?: string;
  showProgress?: boolean;
  progress?: number;
}

export function FileUpload({
  onFileSelected,
  fileType = '*/*',
  maxSize = 30, // 30MB default
  className = '',
  showProgress = false,
  progress = 0
}: FileUploadProps) {
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();


  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleClick = () => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;


    const maxSizeBytes = maxSize * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast({
        title: t('common.file_upload.too_large_title', 'File too large'),
        description: t('common.file_upload.too_large_desc', 'Maximum file size is {{maxSize}}MB', { maxSize }),
        variant: 'destructive'
      });
      return;
    }

    setFileInfo({ name: file.name, size: file.size });
    onFileSelected(file);
  };

  return (
    <div className={className}>
      <input
        type="file"
        ref={inputRef}
        onChange={handleFileChange}
        accept={fileType}
        className="hidden"
        disabled={showProgress}
      />

      {!showProgress && !fileInfo && (
        <Button
          type="button"
          variant="brand"
          onClick={handleClick}
          className="w-full justify-start"
          disabled={showProgress}
          size="sm"
        >
          <Upload className="h-4 w-4 mr-2" />
          {t('common.file_upload.upload_file', 'Upload File')}
        </Button>
      )}

      {showProgress && (
        <div className="space-y-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center">
              <FileIcon className="mr-2 h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate text-sm">
                {fileInfo?.name || t('common.file_upload.uploading', 'Uploading file...')}
              </span>
            </div>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="text-xs text-muted-foreground">
            {fileInfo ? formatFileSize(fileInfo.size) : ''} • {t('common.file_upload.percent_uploaded', '{{progress}}% uploaded', { progress })}
          </div>
        </div>
      )}

      {fileInfo && !showProgress && (
        <div className="space-y-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center">
              <FileIcon className="mr-2 h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate text-sm">{fileInfo.name}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                setFileInfo(null);
                if (inputRef.current) {
                  inputRef.current.value = '';
                }
              }}
              className="h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            {formatFileSize(fileInfo.size)}
          </div>
          <Button
            type="button"
            variant="brand"
            onClick={handleClick}
            className="w-full justify-start mt-1"
            size="sm"
          >
            <Upload className="h-3 w-3 mr-2" />
            {t('common.file_upload.change_file', 'Change file')}
          </Button>
        </div>
      )}
    </div>
  );
}