import { Component, type ReactNode } from 'react'
import { AlertCircle, RefreshCw, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className='flex flex-col items-center justify-center h-full p-8 text-center space-y-4 animate-fade-in select-none'>
          <div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20'>
            <AlertCircle className='h-6 w-6' />
          </div>
          <div className='space-y-1 max-w-md'>
            <h3 className='text-base font-bold text-foreground'>Something went wrong</h3>
            <p className='text-xs text-muted-foreground'>
              An unhandled UI error occurred. You can safely reload the view without losing active
              background transfers.
            </p>
            {this.state.error && (
              <p className='font-mono text-[10px] text-destructive/80 bg-muted/40 p-2 rounded-xl mt-2 border border-border/40 text-left overflow-x-auto'>
                {this.state.error.message}
              </p>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              variant='outline'
              onClick={() =>
                navigator.clipboard.writeText(this.state.error?.message || 'Unknown error')
              }
              className='gap-2 rounded-xl font-bold'
            >
              <Copy className='h-3.5 w-3.5' /> Copy Details
            </Button>
            <Button
              size='sm'
              onClick={() => this.setState({ hasError: false, error: null })}
              className='gap-2 rounded-xl font-bold'
            >
              <RefreshCw className='h-4 w-4' />
              Reload Component
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
