import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import pkg from '../../package.json'

function Section({ title, children }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{title}</h3>
      <div className="space-y-2 text-sm leading-relaxed text-foreground/90">{children}</div>
    </section>
  )
}

export function AboutDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="About this project">
          <Info /> <span className="hidden sm:inline">About</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cyber Sonification Playground</DialogTitle>
          <DialogDescription>Version {pkg.version}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Section title="Concept">
            <p>
              A playground for the <em>Data to Sound</em> workshop. Live cyber-attack data plays a synthesizer and drives a
              generative image. Sonification is the craft of mapping data to sound. Here you make those mapping decisions
              yourself: which piece of data moves which control, in which direction, and how strongly.
            </p>
          </Section>

          <Section title="The data">
            <p>
              The data comes from the{' '}
              <a href="https://isc.sans.edu" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                SANS Internet Storm Center
              </a>{' '}
              (DShield), a community network of sensors that report scanning and attack attempts across the internet.
              Every four minutes the app fetches the most targeted ports, the most active attacking IP addresses and the
              global threat level (Infocon).
            </p>
            <p>
              DShield publishes summaries, not a feed of individual packets. The app turns them into a stream of roughly
              three attacks per second, weighted by how often each address and port really appears, with occasional
              port-scan bursts. If the service cannot be reached, a saved snapshot is used. Nothing about you is
              collected or stored.
            </p>
          </Section>

          <Section title="How to play">
            <p>
              <strong>Sound:</strong> a synth plays one note per attack, and a drone holds an FM chord in the chosen key.{' '}
              <strong>Visual:</strong> a blurred noise field with feedback, followed by a distortion stage.
            </p>
            <p>
              Touch any knob to add it to the matrix, then drag a cell up or down to let a data source move it.{' '}
              <em>Hit</em> fires on every attack. The other sources are the attacked port, how popular that port is, the
              attacker’s address, how often it is reported, the density of attacks and the global threat level.{' '}
              <em>Copy link</em> shares your patch.
            </p>
          </Section>

          <Section title="Credits">
            <p>
              © 2026 Benjamin Rigo. All rights reserved.
              <br />
              Made with Claude by Anthropic.
              <br />
              Attack data courtesy of the SANS Internet Storm Center. The synth design is inspired by Mutable Instruments
              Plaits and Noise Engineering Basimilus Iteritas.
            </p>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
