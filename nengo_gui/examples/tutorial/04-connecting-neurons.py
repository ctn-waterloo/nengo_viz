# Tutorial 4: Connecting neurons

# So far, we have just fed input to a group of neurons and read their output.
# In order to do more interesting things, we need to be able to connect one
# group of neurons to another.  In this example, we have two groups of neurons
# connected together.

# If you just make a Connection between two groups of neurons, Nengo will
# find the connection weights between each of the neurons such that whatever
# value is being represented by the first group of neurons will be passed on
# to the second group of neurons.  Notice that now if you move the slider,
# this affects the value in the first group of neurons, and these in turn
# affect the value in the second group of neurons.

# Whenever you make a connection, you can specify a "synapse" value.  This
# indicates the properties of the neurotransmitters and synapses (the actual
# connections between neurons).  The most important parameter is the
# time constant: the amount of time it takes for the effects of a single spike
# to wear off.  For some parts of the brain, this is very fast (0.002 seconds)
# and in other parts it is very slow (0.2 seconds).  If you don't specify it,
# Nengo will assume you want a fairly fast connection (0.005 seconds).  Try
# changing the synapse value between "a" and "b" to be much slower (0.2). This
# should make the value stored in b change more slowly.

import nengo

model = nengo.Network()
with model:
    stim = nengo.Node(0)
    a = nengo.Ensemble(n_neurons=50, dimensions=1)
    nengo.Connection(stim, a)

    b = nengo.Ensemble(n_neurons=50, dimensions=1)

    nengo.Connection(a, b, synapse=0.01)
