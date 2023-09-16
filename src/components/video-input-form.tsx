import {FileVideo, Upload} from "lucide-react";
import {Separator} from "@/components/ui/separator.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Textarea} from "@/components/ui/textarea.tsx";
import {Button} from "@/components/ui/button.tsx";
import {ChangeEvent, FormEvent, useMemo, useRef, useState} from "react";
import {getFFmpeg} from "@/lib/ffmpeg.ts";
import {fetchFile} from "@ffmpeg/util";
import {api} from "@/lib/axios.ts";

type Status = "waiting" | "converting" | "uploading" | "generating" | "success" | "error";

const statusMessages = {
  waiting: "Aguarde...",
  converting: "Convertendo...",
  uploading: "Enviando...",
  generating: "Gerando...",
  success: "Sucesso!",
  error: "Erro, tente carregar novamente!"
}

interface VideoInputFormProps {
  onVideoUploaded: (videoId: string) => void
}

export function VideoInputForm({ onVideoUploaded }: VideoInputFormProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("waiting");
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const {files} = event.currentTarget;

    if (!files) {
      return;
    }

    const file = files[0];

    setVideoFile(file);
  }

  async function convertVideoToAudio(video: File) {
    console.log("Converting video to audio...");

    const ffmpeg = await getFFmpeg();

    await ffmpeg.writeFile("input.mp4", await fetchFile(video));

    // ffmpeg.on("log", msg => console.log(msg));

    ffmpeg.on("progress", progress => {
      console.log("Convert progress: " + Math.round(progress.progress * 100) + "%");
    })

    await ffmpeg.exec([
      "-i",
      "input.mp4",
      "-map",
      "0:a",
      "-b:a",
      "20k",
      "-acodec",
      "libmp3lame",
      "output.mp3"
    ])

    const data = await ffmpeg.readFile("output.mp3");

    const audioFileBlob = new Blob([data], {type: "audio/mpeg"});
    const audioFile = new File([audioFileBlob], "audio.mp3", {
      type: "audio/mpeg"
    });

    console.log("Converted video to audio!");

    return audioFile;
  }

  async function handleUploadVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!videoFile) {
      return;
    }

    try {
      setStatus("converting");

      const prompt = promptInputRef.current?.value;
      const audioFile = await convertVideoToAudio(videoFile);
      const data = new FormData();

      data.append("file", audioFile);
      setStatus("uploading");

      const response = await api.post("/videos", data);
      const videoId = response.data.video.id;

      setStatus("generating");

      await api.post(`/videos/${videoId}/transcription`, {
        prompt
      })

      setStatus("success");

      onVideoUploaded(videoId);
    } catch (error) {
      console.error(error);
      setStatus("error");
    }
  }

  const previewURL = useMemo(() => {
    if (!videoFile) {
      return null;
    }

    return URL.createObjectURL(videoFile);
  }, [videoFile]);

  return (
    <form onSubmit={handleUploadVideo} className="space-y-6">
      <label
        htmlFor="video"
        className="relative border flex rounded-md aspect-video cursor-pointer border-dashed text-sm flex-col gap-2 items-center justify-center text-muted-foreground hover:bg-primary/5"
      >
        {previewURL ? (
          <video src={previewURL} controls={false} className="pointer-events-none absolute inset-0">
            <source src={previewURL} type="video/mp4" />
          </video>
          ) : (
          <>
            <FileVideo className="w-4 h-4" />
            Selecione um vídeo
          </>
        )}
      </label>

      <input
        type="file"
        id="video"
        accept="video/mp4"
        className="sr-only"
        onChange={handleFileSelected}
      />

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="transcription_prompt">
          Prompt de transcrição
        </Label>
        <Textarea
          ref={promptInputRef}
          disabled={status !== "waiting" && status !== "success" && status !== "error"}
          id="transcription_prompt"
          className="h-20 leading-relaxed resize-none"
          placeholder="Inclua palavras-chave mencionadas no vídeo separadas por vírgula (,)"
        />
      </div>

      <Button
        data-success={status === "success"}
        data-error={status === "error"}
        disabled={status !== "waiting" && status !== "success" && status !== "error"}
        type="submit"
        className="w-full data-[success=true]:bg-emerald-400 data-[error=true]:bg-red-400"
      >
        {status === "waiting" ? (
          <>
            Carregar vídeo <Upload className="w-4 h-4 ml-2" />{" "}
          </>
        ): statusMessages[status]}
      </Button>
    </form>
  )
}