"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/shared/context/auth-context";
import { useFiles } from "@/shared/context/files-context";
import { Button } from "@/src/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { Progress } from "@/src/shared/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/shared/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/components/ui/dialog";
import { useToast } from "@/src/shared/hooks/use-toast";
import { getTrpcUserId } from "@/shared/trpc/auth-header";
import { cn } from "@/src/shared/utils";
import {
  Upload,
  File,
  FileText,
  FileImage,
  FileArchive,
  MoreVertical,
  Download,
  Trash2,
  Eye,
  HardDrive,
} from "lucide-react";
import type { ProjectFile } from "@/shared/types";

interface ProjectFilesProps {
  projectId: string;
  maxSizeMB?: number;
}

export function ProjectFiles({ projectId, maxSizeMB = 50 }: ProjectFilesProps) {
  const { user } = useAuth();
  const { files, addFile, deleteFile, getTotalSize } = useFiles(projectId);
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<ProjectFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalSize = getTotalSize(projectId);
  const maxSize = maxSizeMB * 1024 * 1024;
  const usagePercent = Math.min((totalSize / maxSize) * 100, 100);

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getFileIcon(type: string) {
    if (type.startsWith("image/")) return FileImage;
    if (type.includes("pdf")) return FileText;
    if (type.includes("zip") || type.includes("rar") || type.includes("tar")) return FileArchive;
    return File;
  }

  function getFileColor(type: string) {
    if (type.startsWith("image/")) return "text-blue-400";
    if (type.includes("pdf")) return "text-red-400";
    if (type.includes("zip") || type.includes("rar")) return "text-amber-400";
    if (type.includes("word") || type.includes("document")) return "text-blue-500";
    return "text-muted-foreground";
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = e.target.files;
    if (!selectedFiles || !user) return;

    setIsUploading(true);

    let uploadedCount = 0;
    let currentTotal = totalSize;

    for (const file of Array.from(selectedFiles)) {
      if (currentTotal + file.size > maxSize) {
        toast({
          title: "Limite de armazenamento",
          description: `Não é possível adicionar ${file.name}. Limite de ${maxSizeMB}MB excedido.`,
          variant: "destructive",
        });
        continue;
      }

      try {
        await addFile({ projectId, file });
        currentTotal += file.size;
        uploadedCount += 1;
      } catch {
        toast({
          title: "Falha no upload",
          description: `Não foi possível enviar o arquivo ${file.name}.`,
          variant: "destructive",
        });
      }
    }

    setIsUploading(false);

    if (uploadedCount > 0) {
      toast({
        title: "Upload concluído",
        description: `${uploadedCount} arquivo(s) adicionado(s) com sucesso.`,
      });
    }

    // Limpar input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleDeleteClick(file: ProjectFile) {
    setFileToDelete(file);
    setDeleteDialogOpen(true);
  }

  function confirmDelete() {
    if (fileToDelete) {
      deleteFile(fileToDelete.id);
      toast({
        title: "Arquivo removido",
        description: `${fileToDelete.name} foi removido com sucesso.`,
      });
    }
    setDeleteDialogOpen(false);
    setFileToDelete(null);
  }

  // A rota /api/files/[fileId] exige o header x-user-id (mesma auth do resto
  // do app), que uma navegação simples de <a href>/window.open não
  // incluiria — por isso fazemos um fetch manual com o header, convertemos em
  // blob e disparamos o download/preview por um link/aba temporário (mesmo
  // padrão de handleExportDeck em admin/empresas/page.tsx).
  async function handleDownload(file: ProjectFile) {
    if (!file.url || file.url === "#") {
      toast({
        title: "Download indisponível",
        description: "Este arquivo não possui uma URL válida para download.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(file.url, {
        headers: { "x-user-id": getTrpcUserId() },
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = file.name;
      try {
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    } catch {
      toast({
        title: "Falha no download",
        description: `Não foi possível baixar o arquivo ${file.name}.`,
        variant: "destructive",
      });
    }
  }

  async function handlePreview(file: ProjectFile) {
    if (!file.url || file.url === "#") {
      toast({
        title: "Pré-visualização indisponível",
        description: "Este arquivo não possui uma URL válida para preview.",
        variant: "destructive",
      });
      return;
    }

    // Abre a aba já na hora do clique (gesto síncrono do usuário) pra não
    // ser bloqueada por bloqueador de pop-up — só depois navega ela pro blob,
    // uma vez que o fetch autenticado terminar.
    const previewWindow = window.open("", "_blank");
    try {
      const response = await fetch(file.url, {
        headers: { "x-user-id": getTrpcUserId() },
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (previewWindow) {
        previewWindow.location.href = blobUrl;
      } else {
        window.open(blobUrl, "_blank");
      }
    } catch {
      previewWindow?.close();
      toast({
        title: "Falha na pré-visualização",
        description: `Não foi possível abrir o arquivo ${file.name}.`,
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <File className="h-5 w-5" />
              Arquivos do Projeto
            </span>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              {isUploading ? "Enviando..." : "Upload"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Barra de armazenamento */}
          <div className="p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <span>Armazenamento</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {formatFileSize(totalSize)} / {maxSizeMB}MB
              </span>
            </div>
            <Progress value={usagePercent} className="h-2" />
          </div>

          {/* Input de arquivo oculto */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.zip,.rar"
          />

          {/* Lista de arquivos */}
          {files.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum arquivo ainda</p>
              <p className="text-xs text-muted-foreground">Clique para fazer upload</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => {
                const Icon = getFileIcon(file.type);
                const iconColor = getFileColor(file.type);

                return (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors group"
                  >
                    <div className={cn("p-2 rounded-lg bg-secondary", iconColor)}>
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(file.size)}</span>
                        <span>•</span>
                        <span>{file.uploadedBy}</span>
                        <span>•</span>
                        <span>{new Date(file.createdAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handlePreview(file)}>
                          <Eye className="h-4 w-4 mr-2" />
                          Visualizar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload(file)}>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(file)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Arquivos aceitos: PDF, DOC, DOCX, PNG, JPG, GIF, ZIP, RAR
          </p>
        </CardContent>
      </Card>

      {/* Dialog de confirmação de exclusão */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir arquivo</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{fileToDelete?.name}</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
